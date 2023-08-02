import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as rds from '@aws-cdk/aws-rds';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import * as iam from '@aws-cdk/aws-iam';

interface RdsStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class RdsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: RdsStackProps) {
    super(scope, id, props);

    // Create security group
    const securityGroup = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc: props.vpc,
      description: 'Allow traffic from EC2 instance',
      allowAllOutbound: true
    });

    // Define security group rules
    securityGroup.addIngressRule(ec2.Peer.ipv4('10.0.0.0/16'), ec2.Port.tcp(5432), 'Allow PostgreSQL traffic from within VPC');

    // Create secret for RDS password
    const dbPassword = new secretsmanager.Secret(this, 'DBPassword', {
      description: 'Password for RDS instance'
    });

    // Create RDS instance
    const dbInstance = new rds.DatabaseInstance(this, 'MyRDS', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_12_3 }),
      credentials: rds.Credentials.fromGeneratedSecret('admin', { secret: dbPassword }), 
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE
      },
      securityGroups: [securityGroup],
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.SMALL),
      allocatedStorage: 20,
      multiAz: false,
      backupRetention: cdk.Duration.days(3),
      deletionProtection: false
    });

    // Define IAM role and policy
    const dbAccessRole = new iam.Role(this, 'RdsAccessRole', {
      assumedBy: new iam.ServicePrincipal('rds.amazonaws.com'),
    });

    const policy = new iam.PolicyStatement({
      resources: [dbPassword.secretArn],
      actions: ['secretsmanager:GetSecretValue']
    });

    dbAccessRole.addToPolicy(policy);
    dbInstance.grantConnect(dbAccessRole);
  }
}

